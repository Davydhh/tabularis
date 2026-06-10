//! Interactive SQL shell (`tabularis shell <connection>`).
//!
//! Reads SQL statements terminated by `;` (multi-line input supported) and
//! psql-style backslash meta commands, executing them against the resolved
//! driver. Line editing and persistent history come from rustyline.

use super::run::{effective_limit, override_database, print_query_result};
use super::{output, OutputFormat};
use crate::headless;
use crate::models::DatabaseSelection;
use rustyline::error::ReadlineError;
use rustyline::DefaultEditor;
use std::time::Instant;

const HISTORY_FILE: &str = "cli_history.txt";

struct ShellState {
    format: OutputFormat,
    limit: u32,
    schema: Option<String>,
    /// Include the current database in the prompt — on for multi-database
    /// connections and after a `\use` switch.
    show_db_in_prompt: bool,
}

pub async fn run_shell(
    connection: &str,
    database: Option<String>,
    limit: u32,
    format: OutputFormat,
    schema: Option<String>,
) -> Result<(), String> {
    let (conn, mut params, driver) = headless::resolve_db_driver(connection).await?;
    let multi_db = conn.params.database.is_multi();
    let switched = database.is_some();
    override_database(&mut params, database);

    // Fail fast with a clear message instead of erroring on the first query.
    // `test_connection` (not `ping`): built-in drivers implement `ping` as a
    // check on an *existing* pool, which a fresh headless process never has.
    driver
        .test_connection(&params)
        .await
        .map_err(|e| format!("Could not connect to '{}': {}", conn.name, e))?;

    println!(
        "Connected to {} ({} — {})",
        conn.name,
        conn.params.driver,
        params.database.primary()
    );
    if multi_db {
        println!(
            "Databases on this connection: {} (switch with \\use <db>)",
            conn.params.database.as_vec().join(", ")
        );
    }
    println!("End SQL statements with ';'. Type \\? for help, \\q to quit.");

    let mut state = ShellState {
        format,
        limit,
        schema,
        show_db_in_prompt: multi_db || switched,
    };

    let mut editor = DefaultEditor::new().map_err(|e| e.to_string())?;
    let history_path = crate::paths::get_app_config_dir().join(HISTORY_FILE);
    let _ = editor.load_history(&history_path);

    let mut buffer = String::new();
    loop {
        let prompt = if buffer.is_empty() {
            if state.show_db_in_prompt {
                format!("{}:{}> ", conn.name, params.database.primary())
            } else {
                format!("{}> ", conn.name)
            }
        } else {
            "... ".to_string()
        };

        match editor.readline(&prompt) {
            Ok(line) => {
                let trimmed = line.trim();
                if buffer.is_empty() {
                    if trimmed.is_empty() {
                        continue;
                    }
                    if trimmed.starts_with('\\')
                        || trimmed.eq_ignore_ascii_case("exit")
                        || trimmed.eq_ignore_ascii_case("quit")
                    {
                        let _ = editor.add_history_entry(trimmed);
                        if handle_meta(trimmed, &mut state, &mut params, &*driver).await {
                            break;
                        }
                        continue;
                    }
                }

                buffer.push_str(&line);
                buffer.push('\n');

                if buffer.trim_end().ends_with(';') {
                    let statement = buffer.trim().to_string();
                    let _ = editor.add_history_entry(&statement);
                    buffer.clear();

                    let sql = statement.trim_end_matches(';').trim();
                    if sql.is_empty() {
                        continue;
                    }

                    let start = Instant::now();
                    match driver
                        .execute_query(
                            &params,
                            sql,
                            effective_limit(state.limit),
                            1,
                            state.schema.as_deref(),
                        )
                        .await
                    {
                        Ok(result) => print_query_result(&result, state.format, start.elapsed()),
                        Err(e) => print_error(&e),
                    }
                }
            }
            // Ctrl-C: drop any half-typed statement, keep the shell alive.
            Err(ReadlineError::Interrupted) => {
                buffer.clear();
            }
            // Ctrl-D: exit.
            Err(ReadlineError::Eof) => break,
            Err(e) => return Err(e.to_string()),
        }
    }

    if let Err(e) = editor.save_history(&history_path) {
        log::warn!("Failed to save shell history: {}", e);
    }
    println!("Bye");
    Ok(())
}

/// Handle a meta command. Returns `true` when the shell should exit.
async fn handle_meta(
    input: &str,
    state: &mut ShellState,
    params: &mut crate::models::ConnectionParams,
    driver: &dyn crate::drivers::driver_trait::DatabaseDriver,
) -> bool {
    let mut parts = input.split_whitespace();
    let command = parts.next().unwrap_or("");
    let arg = parts.next();

    match command {
        "\\q" | "exit" | "quit" => return true,
        "\\?" | "\\h" | "\\help" => print_help(),
        "\\use" => match arg {
            Some(db) => {
                // Validate the switch on a throwaway copy so a typo'd
                // database name leaves the session on the current one.
                let mut candidate = params.clone();
                candidate.database = DatabaseSelection::Single(db.to_string());
                match driver.test_connection(&candidate).await {
                    Ok(()) => {
                        *params = candidate;
                        state.show_db_in_prompt = true;
                        println!("Now using database {}", db);
                    }
                    Err(e) => print_error(&format!("cannot switch to {}: {}", db, e)),
                }
            }
            None => println!("Current database: {}", params.database.primary()),
        },
        "\\l" => match driver.get_databases(params).await {
            Ok(names) => print_name_list(&names),
            Err(e) => print_error(&e),
        },
        "\\dn" => match driver.get_schemas(params).await {
            Ok(names) => print_name_list(&names),
            Err(e) => print_error(&e),
        },
        "\\dt" => match driver.get_tables(params, state.schema.as_deref()).await {
            Ok(tables) => {
                let names: Vec<String> = tables.into_iter().map(|t| t.name).collect();
                print_name_list(&names);
            }
            Err(e) => print_error(&e),
        },
        "\\d" => match arg {
            Some(table) => describe_table(state, params, driver, table).await,
            None => eprintln!("Usage: \\d <table>"),
        },
        "\\f" => match arg {
            Some("table") => state.format = OutputFormat::Table,
            Some("json") => state.format = OutputFormat::Json,
            Some("csv") => state.format = OutputFormat::Csv,
            _ => eprintln!("Usage: \\f <table|json|csv>"),
        },
        "\\limit" => match arg.and_then(|a| a.parse::<u32>().ok()) {
            Some(n) => {
                state.limit = n;
                if n == 0 {
                    println!("Row limit disabled");
                } else {
                    println!("Row limit set to {}", n);
                }
            }
            None => eprintln!("Usage: \\limit <n>  (0 = unlimited)"),
        },
        "\\schema" => {
            state.schema = arg.map(String::from);
            match &state.schema {
                Some(s) => println!("Schema set to {}", s),
                None => println!("Schema reset to driver default"),
            }
        }
        _ => eprintln!("Unknown command: {}  (\\? for help)", command),
    }
    false
}

async fn describe_table(
    state: &ShellState,
    params: &crate::models::ConnectionParams,
    driver: &dyn crate::drivers::driver_trait::DatabaseDriver,
    table: &str,
) {
    let schema = state.schema.as_deref();
    match driver.get_columns(params, table, schema).await {
        Ok(columns) => {
            let headers = ["COLUMN", "TYPE", "NULLABLE", "PK", "DEFAULT"]
                .map(String::from)
                .to_vec();
            let rows: Vec<Vec<String>> = columns
                .iter()
                .map(|c| {
                    vec![
                        c.name.clone(),
                        c.data_type.clone(),
                        if c.is_nullable { "YES" } else { "NO" }.to_string(),
                        if c.is_pk { "PK" } else { "" }.to_string(),
                        c.default_value.clone().unwrap_or_default(),
                    ]
                })
                .collect();
            println!("{}", output::render_table(&headers, &rows));
        }
        Err(e) => print_error(&e),
    }
}

fn print_name_list(names: &[String]) {
    for name in names {
        println!("{}", output::sanitize_text(name));
    }
    println!("({} found)", names.len());
}

/// Print a driver/server error. The message can embed server-controlled text,
/// so it goes through the same control-character sanitization as query output.
fn print_error(error: &str) {
    eprintln!("ERROR: {}", output::sanitize_text(error));
}

fn print_help() {
    println!(
        "Meta commands:
  \\q, exit, quit       Quit the shell
  \\?                   Show this help
  \\use [db]            Switch database, or show the current one
  \\l                   List databases
  \\dn                  List schemas
  \\dt                  List tables (in the current schema)
  \\d <table>           Show the columns of a table
  \\f <table|json|csv>  Set the output format
  \\limit <n>           Set the row limit (0 = unlimited)
  \\schema [name]       Set or reset the current schema

Any other input is buffered as SQL and executed when a line ends with ';'.
Each statement runs on its own pooled connection, so session state
(SET, BEGIN/COMMIT, temp tables) does not persist between statements."
    );
}

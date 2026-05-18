//! Pure SQL Server identifier / literal helpers and parameter-binding adapters.
//!
//! The string utilities are deliberately kept free of any tiberius or async
//! dependency so they can be unit-tested trivially and reused by multiple
//! modules (introspection, DDL, explain).

/// Wrap an identifier in square brackets — the SQL Server convention that is
/// safest for reserved words and for identifiers containing spaces, dots, or
/// hyphens. A closing bracket inside the identifier is escaped by doubling.
///
/// Reference: <https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers>
///
/// ```text
/// bracket_quote("dbo")        -> "[dbo]"
/// bracket_quote("my table")   -> "[my table]"
/// bracket_quote("weird]name") -> "[weird]]name]"
/// ```
pub fn bracket_quote(name: &str) -> String {
    let mut out = String::with_capacity(name.len() + 2);
    out.push('[');
    for ch in name.chars() {
        if ch == ']' {
            out.push_str("]]");
        } else {
            out.push(ch);
        }
    }
    out.push(']');
    out
}

/// ANSI-style double-quoted identifier (requires `SET QUOTED_IDENTIFIER ON`,
/// which is the SQL Server default). A double-quote inside the identifier is
/// escaped by doubling. Prefer [`bracket_quote`] for DDL; this is for cases
/// where we echo back the driver-wide `identifier_quote` from the manifest.
pub fn quote_identifier(name: &str) -> String {
    let mut out = String::with_capacity(name.len() + 2);
    out.push('"');
    for ch in name.chars() {
        if ch == '"' {
            out.push_str("\"\"");
        } else {
            out.push(ch);
        }
    }
    out.push('"');
    out
}

/// Produce a `[schema].[object]` reference. When `schema` is `None` or empty,
/// falls back to `[dbo]` (the SQL Server default schema).
pub fn qualify(schema: Option<&str>, object: &str) -> String {
    let schema = schema.unwrap_or("dbo");
    let schema = if schema.trim().is_empty() {
        "dbo"
    } else {
        schema
    };
    format!("{}.{}", bracket_quote(schema), bracket_quote(object))
}

/// Escape a single-quoted string literal by doubling embedded single quotes.
/// **Do not use this for parameterised values** — prefer tiberius parameter
/// binding (`@P1` / `conn.query(sql, &[&value])`). This helper is only for
/// metadata queries where the value is also the searchable key (e.g. when
/// embedding a schema name into a diagnostic comment).
pub fn escape_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

/// Build a parameterised `WHERE` clause for a composite primary key.
///
/// `pk_cols` are bracket-quoted; each column is bound to an ordinal marker
/// starting at `@P{start_marker}`. The caller passes the matching values to
/// tiberius `.query()` in the same order, ensuring `@Pn` lines up positionally.
///
/// Returns `None` when `pk_cols` is empty — callers must treat this as a
/// programmer error (no PK to identify a row by).
///
/// ```text
/// build_pk_where_clause(&["id".into()], 1)
///   -> Some("[id] = @P1")
/// build_pk_where_clause(&["tenant_id".into(), "user_id".into()], 1)
///   -> Some("[tenant_id] = @P1 AND [user_id] = @P2")
/// build_pk_where_clause(&["a".into(), "b".into()], 2)
///   -> Some("[a] = @P2 AND [b] = @P3")
/// ```
pub fn build_pk_where_clause(pk_cols: &[String], start_marker: usize) -> Option<String> {
    if pk_cols.is_empty() {
        return None;
    }
    let parts: Vec<String> = pk_cols
        .iter()
        .enumerate()
        .map(|(i, col)| format!("{} = @P{}", bracket_quote(col), start_marker + i))
        .collect();
    Some(parts.join(" AND "))
}

/// Build a parameterised `DELETE` statement targeting a composite primary key.
///
/// Returns `None` when `pk_cols` is empty.
pub fn build_delete_composite_sql(
    schema: Option<&str>,
    table: &str,
    pk_cols: &[String],
) -> Option<String> {
    let where_clause = build_pk_where_clause(pk_cols, 1)?;
    Some(format!(
        "DELETE FROM {} WHERE {}",
        qualify(schema, table),
        where_clause
    ))
}

/// Build a parameterised `UPDATE` statement that sets `col_name` to `@P1`
/// and matches rows by a composite primary key bound to `@P2`..`@P{n+1}`.
///
/// Returns `None` when `pk_cols` is empty.
pub fn build_update_composite_sql(
    schema: Option<&str>,
    table: &str,
    col_name: &str,
    pk_cols: &[String],
) -> Option<String> {
    let where_clause = build_pk_where_clause(pk_cols, 2)?;
    Some(format!(
        "UPDATE {} SET {} = @P1 WHERE {}",
        qualify(schema, table),
        bracket_quote(col_name),
        where_clause
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bracket_quote_wraps_plain_identifier() {
        assert_eq!(bracket_quote("dbo"), "[dbo]");
        assert_eq!(bracket_quote("MyTable"), "[MyTable]");
    }

    #[test]
    fn bracket_quote_preserves_dots_and_spaces() {
        assert_eq!(bracket_quote("my.table"), "[my.table]");
        assert_eq!(bracket_quote("name with space"), "[name with space]");
    }

    #[test]
    fn bracket_quote_escapes_closing_bracket() {
        assert_eq!(bracket_quote("weird]name"), "[weird]]name]");
        assert_eq!(bracket_quote("]"), "[]]]");
        assert_eq!(bracket_quote("a]]b"), "[a]]]]b]");
    }

    #[test]
    fn bracket_quote_handles_empty_string() {
        assert_eq!(bracket_quote(""), "[]");
    }

    #[test]
    fn bracket_quote_leaves_other_specials_intact() {
        // Brackets and ] are the only metacharacters inside [..] — square
        // brackets are *not* regex there, and single quotes are irrelevant.
        assert_eq!(bracket_quote("a'b\"c"), "[a'b\"c]");
    }

    #[test]
    fn quote_identifier_wraps_and_escapes_double_quote() {
        assert_eq!(quote_identifier("col"), "\"col\"");
        assert_eq!(quote_identifier("weird\"name"), "\"weird\"\"name\"");
        assert_eq!(quote_identifier(""), "\"\"");
    }

    #[test]
    fn qualify_uses_dbo_when_schema_missing() {
        assert_eq!(qualify(None, "Users"), "[dbo].[Users]");
        assert_eq!(qualify(Some(""), "Users"), "[dbo].[Users]");
        assert_eq!(qualify(Some("   "), "Users"), "[dbo].[Users]");
    }

    #[test]
    fn qualify_keeps_explicit_schema() {
        assert_eq!(qualify(Some("sales"), "Orders"), "[sales].[Orders]");
    }

    #[test]
    fn qualify_escapes_brackets_in_both_parts() {
        assert_eq!(
            qualify(Some("we]ird"), "ta]ble"),
            "[we]]ird].[ta]]ble]"
        );
    }

    #[test]
    fn escape_single_quoted_doubles_apostrophes() {
        assert_eq!(escape_single_quoted("o'brien"), "o''brien");
        assert_eq!(escape_single_quoted("'''"), "''''''");
        assert_eq!(escape_single_quoted("plain"), "plain");
    }

    #[test]
    fn bracket_quote_is_round_trip_safe_through_itself() {
        // Quoting an already-quoted identifier is a useful invariant for
        // nested composition: bracket_quote(bracket_quote(x)) must still be
        // parseable — it just adds another layer of brackets.
        let once = bracket_quote("weird]name");
        let twice = bracket_quote(&once);
        assert!(twice.starts_with('['));
        assert!(twice.ends_with(']'));
        // Inner brackets ']' are each doubled again.
        assert!(twice.contains("]]]]"));
    }

    // --- composite PK SQL builders (issue #145) ----------------------------

    #[test]
    fn pk_where_clause_returns_none_for_empty_cols() {
        assert_eq!(build_pk_where_clause(&[], 1), None);
    }

    #[test]
    fn pk_where_clause_single_column_starts_at_p1() {
        assert_eq!(
            build_pk_where_clause(&["id".to_string()], 1),
            Some("[id] = @P1".to_string())
        );
    }

    #[test]
    fn pk_where_clause_composite_chains_with_and() {
        assert_eq!(
            build_pk_where_clause(
                &["tenant_id".to_string(), "user_id".to_string()],
                1
            ),
            Some("[tenant_id] = @P1 AND [user_id] = @P2".to_string())
        );
    }

    #[test]
    fn pk_where_clause_offset_marker_for_update_path() {
        // UPDATE binds the new value at @P1, so the PK markers start at @P2.
        assert_eq!(
            build_pk_where_clause(&["a".to_string(), "b".to_string()], 2),
            Some("[a] = @P2 AND [b] = @P3".to_string())
        );
    }

    #[test]
    fn pk_where_clause_escapes_brackets_in_column_names() {
        assert_eq!(
            build_pk_where_clause(&["we]ird".to_string()], 1),
            Some("[we]]ird] = @P1".to_string())
        );
    }

    #[test]
    fn delete_composite_sql_uses_dbo_when_schema_missing() {
        let sql = build_delete_composite_sql(None, "Users", &["id".to_string()]).unwrap();
        assert_eq!(sql, "DELETE FROM [dbo].[Users] WHERE [id] = @P1");
    }

    #[test]
    fn delete_composite_sql_chains_composite_keys() {
        let sql = build_delete_composite_sql(
            Some("sales"),
            "OrderItems",
            &["order_id".to_string(), "line_no".to_string()],
        )
        .unwrap();
        assert_eq!(
            sql,
            "DELETE FROM [sales].[OrderItems] WHERE [order_id] = @P1 AND [line_no] = @P2"
        );
    }

    #[test]
    fn delete_composite_sql_returns_none_without_pk() {
        assert_eq!(build_delete_composite_sql(None, "Users", &[]), None);
    }

    #[test]
    fn update_composite_sql_binds_new_value_at_p1_and_pk_at_p2() {
        let sql = build_update_composite_sql(
            None,
            "Users",
            "email",
            &["id".to_string()],
        )
        .unwrap();
        assert_eq!(
            sql,
            "UPDATE [dbo].[Users] SET [email] = @P1 WHERE [id] = @P2"
        );
    }

    #[test]
    fn update_composite_sql_chains_composite_keys_starting_at_p2() {
        let sql = build_update_composite_sql(
            Some("sales"),
            "OrderItems",
            "qty",
            &["order_id".to_string(), "line_no".to_string()],
        )
        .unwrap();
        assert_eq!(
            sql,
            "UPDATE [sales].[OrderItems] SET [qty] = @P1 WHERE [order_id] = @P2 AND [line_no] = @P3"
        );
    }

    #[test]
    fn update_composite_sql_returns_none_without_pk() {
        assert_eq!(
            build_update_composite_sql(None, "Users", "email", &[]),
            None
        );
    }

    #[test]
    fn update_composite_sql_escapes_brackets_in_column_and_pk_names() {
        let sql = build_update_composite_sql(
            Some("we]ird"),
            "ta]ble",
            "co]l",
            &["p]k".to_string()],
        )
        .unwrap();
        assert_eq!(
            sql,
            "UPDATE [we]]ird].[ta]]ble] SET [co]]l] = @P1 WHERE [p]]k] = @P2"
        );
    }
}

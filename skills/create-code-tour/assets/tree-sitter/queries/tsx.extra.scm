; typescript.extra.scm と同内容（TSX 文法は TypeScript 文法と同じノード名を持つ）。
(type_alias_declaration name: (type_identifier) @name) @definition.type

(enum_declaration name: (identifier) @name) @definition.enum

(lexical_declaration (variable_declarator name: (identifier) @name)) @definition.constant

(variable_declaration (variable_declarator name: (identifier) @name)) @definition.variable

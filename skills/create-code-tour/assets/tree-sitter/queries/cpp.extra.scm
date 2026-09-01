; 上流の tags.scm は変数宣言を宣言として扱わない。
(declaration declarator: (init_declarator declarator: (identifier) @name)) @definition.variable

(field_declaration declarator: (field_identifier) @name) @definition.field

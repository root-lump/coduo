; 上流の tags.scm（JavaScript の tags との差分）は、型エイリアス・列挙・
; 関数以外の変数宣言を宣言として扱わない。ここで補う。
; 関数を値に持つ宣言は上流が @definition.function として拾っており、位置が重なるが、
; 索引側が種別の優先順で重複を畳む。
(type_alias_declaration name: (type_identifier) @name) @definition.type

(enum_declaration name: (identifier) @name) @definition.enum

(lexical_declaration (variable_declarator name: (identifier) @name)) @definition.constant

(variable_declaration (variable_declarator name: (identifier) @name)) @definition.variable

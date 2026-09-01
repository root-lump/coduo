; 上流の tags.scm は、値が関数の変数宣言しか宣言として扱わない。
; 定数・変数そのものを補う（関数を値に持つものは種別の優先順で畳まれる）。
(lexical_declaration (variable_declarator name: (identifier) @name)) @definition.constant

(variable_declaration (variable_declarator name: (identifier) @name)) @definition.variable

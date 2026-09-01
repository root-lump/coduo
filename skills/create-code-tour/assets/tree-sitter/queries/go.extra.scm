; 上流の tags.scm は var / const のパターンに @definition を付けていないため、
; パッケージレベルの定数と変数が宣言として拾われない。ここで補う。
(const_declaration (const_spec name: (identifier) @name)) @definition.constant

(var_declaration (var_spec name: (identifier) @name)) @definition.variable

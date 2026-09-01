package sample

// 日本語コメント: 定数と変数の宣言
const MaxItems = 10

var defaultName = "coduo"

type Store struct {
	items []string
}

type Reader interface {
	Read() string
}

func NewStore() *Store {
	return &Store{}
}

func (s *Store) Add(item string) {
	s.items = append(s.items, item)
}

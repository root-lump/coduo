//! 日本語コメント: 構造体とトレイトと定数
pub const MAX_ITEMS: usize = 10;

pub struct Store {
    items: Vec<String>,
}

pub trait Reader {
    fn read(&self) -> String;
}

impl Store {
    pub fn add(&mut self, item: String) {
        self.items.push(item);
    }
}

pub fn new_store() -> Store {
    Store { items: Vec::new() }
}

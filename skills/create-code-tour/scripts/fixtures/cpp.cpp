// 日本語コメント: 構造体と関数と定数
namespace sample {

const int MaxItems = 10;

struct Store {
  void Add(const char* item);
};

class Reader {
 public:
  const char* Read();
};

Store* NewStore() { return new Store(); }

}  // namespace sample

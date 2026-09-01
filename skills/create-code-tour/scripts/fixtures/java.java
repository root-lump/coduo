package sample;

// 日本語コメント: クラスとインターフェースと定数
public interface Reader {
    String read();
}

class Store {
    static final int MAX_ITEMS = 10;

    void add(String item) {
        System.out.println(item);
    }
}

namespace Sample;

// 日本語コメント: クラスとインターフェースと定数
public interface IReader
{
    string Read();
}

public class Store
{
    public const int MaxItems = 10;

    public void Add(string item)
    {
        System.Console.WriteLine(item);
    }
}

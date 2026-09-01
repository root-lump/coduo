# 日本語コメント: モジュールとクラスと定数
module Sample
  MAX_ITEMS = 10

  class Store
    def add(item)
      items << item
    end
  end

  def self.new_store
    Store.new
  end
end

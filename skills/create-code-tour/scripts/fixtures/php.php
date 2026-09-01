<?php

// 日本語コメント: クラスとインターフェースと定数
const MAX_ITEMS = 10;

interface Reader
{
    public function read(): string;
}

class Store
{
    public function add(string $item): void
    {
        echo $item;
    }
}

function newStore(): Store
{
    return new Store();
}

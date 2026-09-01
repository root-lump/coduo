// 日本語コメント: 型エイリアスと列挙と定数
export type StoreName = string;

export enum Mode {
  Read,
}

export interface Reader {
  read(): string;
}

export const MAX_ITEMS = 10;

export const createStore = () => new Store();

export function newStore(): Store {
  return new Store();
}

export class Store {
  add(item: string): void {
    void item;
  }
}

export type FileRequest<T> = {
  id: number;
  cached?: T;
};

export class FileRequestCoordinator<T> {
  private currentId = 0;
  private readonly cache = new Map<string, T>();

  begin(key: string, useCache = true): FileRequest<T> {
    if (!useCache) {
      this.cache.delete(key);
    }
    return {
      id: ++this.currentId,
      cached: useCache ? this.cache.get(key) : undefined,
    };
  }

  complete(id: number, key: string, value: T): boolean {
    if (!this.isCurrent(id)) {
      return false;
    }
    this.cache.set(key, value);
    return true;
  }

  isCurrent(id: number): boolean {
    return id === this.currentId;
  }

  clear(): void {
    this.currentId += 1;
    this.cache.clear();
  }
}

// Polyfills for TC39 proposals (Map/WeakMap getOrInsertComputed & getOrInsert)
// Required by pdfjs-dist in environments without stage 3 proposals

if (typeof Map !== 'undefined') {
  if (!(Map.prototype as any).getOrInsertComputed) {
    (Map.prototype as any).getOrInsertComputed = function (key: any, callbackfn: (k: any) => any) {
      if (this.has(key)) return this.get(key);
      const value = callbackfn(key);
      this.set(key, value);
      return value;
    };
  }
  if (!(Map.prototype as any).getOrInsert) {
    (Map.prototype as any).getOrInsert = function (key: any, defaultValue: any) {
      if (this.has(key)) return this.get(key);
      this.set(key, defaultValue);
      return defaultValue;
    };
  }
}

if (typeof WeakMap !== 'undefined') {
  if (!(WeakMap.prototype as any).getOrInsertComputed) {
    (WeakMap.prototype as any).getOrInsertComputed = function (key: any, callbackfn: (k: any) => any) {
      if (this.has(key)) return this.get(key);
      const value = callbackfn(key);
      this.set(key, value);
      return value;
    };
  }
  if (!(WeakMap.prototype as any).getOrInsert) {
    (WeakMap.prototype as any).getOrInsert = function (key: any, defaultValue: any) {
      if (this.has(key)) return this.get(key);
      this.set(key, defaultValue);
      return defaultValue;
    };
  }
}

export {};

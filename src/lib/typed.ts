export function typedEntries<T extends Record<string, any>>(obj: T): Array<[keyof T & string, T[keyof T]]> {
  return Object.entries(obj) as any;
}


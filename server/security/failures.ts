export class WriterConflict extends Error {
  constructor() {
    super("Another game writer owns this database");
  }
}

export const MAX_INPUT_CHARACTERS = 200000;
export const MAX_INPUT_BYTES = 800000; // UTF-8 can use four bytes per character.
export const MAX_IMPORT_ROWS = 500;
export const MAX_RECORD_CHARACTERS = 8000;
export const MAX_CSV_COLUMNS = 64;
export const MAX_METADATA_ITEMS = 64;

export async function readImportFile(file) {
  if (!file || !/\.(txt|csv)$/i.test(file.name)) throw new Error('Choose one .txt or .csv file.');
  if (!Number.isSafeInteger(file.size) || file.size > MAX_INPUT_BYTES) throw new RangeError('Import files are limited to 800,000 bytes and 200,000 characters.');
  const text = await file.text();
  if (text.length > MAX_INPUT_CHARACTERS) throw new RangeError('Deck input is limited to 200,000 characters.');
  return text;
}

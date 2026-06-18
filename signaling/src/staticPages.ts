import * as fs from 'fs';
import * as path from 'path';

export function loadStaticPage(page: string): string {
  const filePath = path.join(__dirname, '..', 'public', page);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return `<html><body><h1>Page not found: ${page}</h1></body></html>`;
  }
}

import { getAllBooksWithOverrides, getLastReadTimes } from "@/lib/books";
import Bookshelf from "./Bookshelf";

// ISR: cached for 60s. "lastRead" sort order may lag by up to a minute,
// but the function skips Redis reads + rendering on cache hits.
export const revalidate = 60;

export default async function HomePage() {
  const books = await getAllBooksWithOverrides();
  const bookIds = books.map((b) => b.meta.bookId);
  const lastReadTimes = await getLastReadTimes(bookIds);

  books.sort((a, b) => {
    const ta = lastReadTimes[a.meta.bookId] ?? 0;
    const tb = lastReadTimes[b.meta.bookId] ?? 0;
    return tb - ta;
  });

  return <Bookshelf books={books} />;
}

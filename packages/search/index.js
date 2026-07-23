const indexes = new Map();

const normalize = (value) => String(value ?? '').toLowerCase();

export function registerSearchProvider(moduleName, provider) {
  indexes.set(moduleName, provider);
  return () => indexes.delete(moduleName);
}

export async function globalSearch(query, context = {}) {
  const needle = normalize(query).trim();
  if (!needle) return [];

  const results = await Promise.all(
    [...indexes.entries()].map(async ([moduleName, provider]) => {
      const matches = await provider.search(needle, context);
      return matches.map((match) => ({ module: moduleName, ...match }));
    })
  );

  return results.flat().sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function createInMemorySearchProvider(records = [], fields = []) {
  return {
    setRecords(nextRecords) {
      records = nextRecords;
    },
    async search(query) {
      return records
        .map((record) => {
          const haystack = fields.map((field) => normalize(record[field])).join(' ');
          if (!haystack.includes(query)) return null;
          return { id: record.id, title: record.name || record.quality || record.party || record.id, record, score: query.length / Math.max(haystack.length, 1) };
        })
        .filter(Boolean);
    },
  };
}

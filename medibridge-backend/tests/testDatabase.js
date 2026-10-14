function assertTestDatabase(uri) {
  let name;
  try { name = decodeURIComponent(new URL(uri).pathname.replace(/^\//, '')); } catch (error) {
    throw new Error('MONGO_URI_TEST must be a valid MongoDB URI.');
  }
  if (!/(^|[_-])test($|[_-])/i.test(name)) {
    throw new Error(`Refusing destructive tests against non-test database "${name || '(empty)'}".`);
  }
}

exports.createTestDatabase = async () => {
  if (!process.env.MONGO_URI_TEST) throw new Error('MONGO_URI_TEST is required for integration tests.');
  assertTestDatabase(process.env.MONGO_URI_TEST);
  return { uri: process.env.MONGO_URI_TEST, stop: async () => {} };
};

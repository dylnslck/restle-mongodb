import normalizeCollectionName from '../../../dist/lib/utils/normalize-collection-name';
import test from 'tape';

test('normalizeCollectionName', assert => {
  const type = 'User';
  const collection = normalizeCollectionName(type);

  assert.equal(collection, 'users');
  assert.end();
});

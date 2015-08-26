import Adapter from '../../../dist/lib';
import test from 'tape';

test('normalizeCollectionName', assert => {
  const type = 'User';
  const collection = Adapter.normalizeCollectionName(type);

  assert.equal(collection, 'users');
  assert.end();
});

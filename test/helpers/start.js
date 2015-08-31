import Adapter from '../../../dist/lib';
import flushCollections from '../helpers/flush-collections';
import mongodb from 'mongodb';

import connect from 'tape';
import flush from 'tape';
import disconnect from 'tape';

const url = 'mongodb://restle:restle@ds035613.mongolab.com:35613/restle-dev';
const adapter = new Adapter({ url });

const start = new Promise(resolve => {
  flush('flush collections', assert => {
    const MongoClient = mongodb.MongoClient;
    const database = url;

    MongoClient.connect(database, (err, db) => {
      assert.error(err, 'connected to database');

      flushCollections(assert, db, () => {
        assert.end();
        db.close();
      });
    });
  });

  connect('connect adapter to database', assert => {
    adapter.connect().then(() => {
      assert.ok(adapter.db, 'internal db object found');
      assert.end();
    });
  });

  return resolve(adapter);
});

const stop = new Promise(resolve => {
  disconnect('disconnect adapter from database', assert => {
    adapter.disconnect().then(() => {
      assert.notOk(adapter.db, 'internal db object deleted');
      assert.end();
    });
  });

  return resolve(true);
});

export default { start, stop };

import Adapter from '../../../dist/lib';
import test from 'tape';
import before from 'tape';
import after from 'tape';

const adapter = new Adapter({
  url: 'mongodb://restle:restle@ds035613.mongolab.com:35613/restle-dev',
});

before('Connect adapter to database', assert => {
  adapter.connect().then(() => {
    assert.ok(adapter.db, 'internal db object found');
    assert.end();
  }, err => {
    assert.error(err, 'no error connecting database');
    assert.fail('error connecting to database');
    assert.end();
  });
});

test(`find('users') should be empty`, assert => {
  adapter.find('users').then(docs => {
    assert.equal(docs.length, 0, 'no users in database');
    assert.end();
  });
});

test(`create('users')`, assert => {
  const user = {
    'name': 'Billy Smith',
    'email': 'bs@gmail.com',
  };

  adapter.create('users', user).then(doc => {
    assert.ok(doc.id, 'an id was assigned to the user');
    assert.end();
  });
});

test(`find('users') then findOne('users', :firstId) then update('users', :firstId) then remove('users', :firstId)`, assert => {
  adapter.find('users').then(docs => {
    assert.equal(docs.length, 1, 'should be one user in database');

    const id = docs[0].id;
    adapter.findOne('users', id).then(doc => {
      assert.deepEqual(doc, {
        'name': 'Billy Smith',
        'email': 'bs@gmail.com',
        'id': `${id}`,
      }, 'user is looking good');

      adapter.update('users', id, { name: 'Bobby Smith' }).then(update => {
        assert.ok(update, 'update was successfull');

        adapter.delete('users', id).then(deletion => {
          assert.ok(deletion, 'deletion was successfull');
          assert.end();
        }, (err) => {
          console.log(err);
          assert.fail('deletion failed');
          assert.end();
        });
      }, (err) => {
        console.log(err);
        assert.fail('update failed');
        assert.end();
      });
    });
  });
});

test(`find('users') should be empty`, assert => {
  adapter.find('users').then(docs => {
    assert.equal(docs.length, 0, 'no users in database');
    assert.end();
  });
});

after('Disconnect adapter from database', assert => {
  adapter.disconnect().then(() => {
    assert.notOk(adapter.db, 'internal db object deleted');
    assert.end();
  }, err => {
    assert.error(err, 'no error disconnecting database');
    assert.fail('error disconnecting database');
    assert.end();
  });
});

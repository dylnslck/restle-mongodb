import Adapter from '../../../dist/lib';
import flushCollections from '../helpers/flush-collections';
import mongodb from 'mongodb';
import init from 'tape';
import test from 'tape';
import before from 'tape';
import after from 'tape';

const url = 'mongodb://restle:restle@ds035613.mongolab.com:35613/restle-dev';
const adapter = new Adapter({ url });

// mockups
const userModel = {
  type: 'user',
  getRelationship(type) {
    const relationships = {
      posts: {
        name: 'posts',
        type: 'post',
        isMany: true,
        related: {
          author: {
            type: 'user',
            isMany: false,
          },
        },
      },
    };

    return relationships[type];
  },
  hasRelationship(type) {
    return !!this.getRelationship(type);
  },
};

const postModel = {
  type: 'post',
  getRelationship(type) {
    const relationships = {
      author: {
        name: 'author',
        type: 'user',
        isMany: false,
        related: {
          comments: {
            type: 'comment',
            isMany: true,
          },
        }
      },
    };

    return relationships[type];
  },
  hasRelationship(type) {
    return !!this.getRelationship(type);
  },
};

init('flush collections', assert => {
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

before('connect adapter to database', assert => {
  adapter.connect().then(() => {
    assert.ok(adapter.db, 'internal db object found');
    assert.end();
  });
});

test(`find(userModel) should be empty`, assert => {
  adapter.find(userModel).then(docs => {
    assert.equal(docs.length, 0, 'no users in database');
    assert.end();
  });
});

test(`createResource(userModel) then createResource(postModel)`, assert => {
  const userSchema = {
    'name': 'Johnny John',
    'email': 'jj@gmail.com',
    'posts': [],
  };

  adapter.createResource(userModel, userSchema).then(user => {
    assert.ok(user.id, 'an id was assigned to the user');

    const postSchema = {
      'title': 'Awesome Title',
      'author': `${user.id}`,
      'comments': [],
    };

    adapter.createResource(postModel, postSchema).then(post => {
      assert.ok(post.id, 'an id was assigned to the post');
      assert.end();
    });
  });
});

test(`find(postModel) then findRelated(postModel, :firstId, 'author')`, assert => {
  adapter.find(postModel).then(posts => {
    const postId = posts[0].id;

    assert.deepEqual(posts, [{
      id: postId,
      title: 'Awesome Title',
      author: posts[0].author,
      comments: [],
    }], 'the posts look good');

    adapter.findRelated(postModel, postId, 'author').then(author => {
      assert.ok(author);
      assert.end();
    });
  });
});

test(`find(postModel) then find(userModel) then appendRelationship(userModel, :userId, 'posts', :postId)`, assert => {
  adapter.find(postModel).then(posts => {
    const postId = posts[0].id;
    assert.ok(posts, 'posts are all there');

    console.log('posts');
    console.log(posts);

    adapter.find(userModel).then(users => {
      const userId = users[0].id;
      assert.ok(users, 'users are all there');

      console.log('users');
      console.log(users);

      adapter.appendRelationship(userModel, userId, 'posts', postId).then(success => {
        assert.ok(success, 'relationship successfully added');
        assert.end();
      });
    });
  });
});

test(`find(userModel) then findRelated(userModel, :userId, 'posts') then deleteRelationship(userModel, :userId, 'posts', :postId)`, assert => {
  adapter.find(userModel).then(users => {
    const userId = users[0].id;
    assert.ok(userId, 'first user has a valid id');

    adapter.findRelated(userModel, userId, 'posts').then(posts => {
      const postId = posts[0].id;
      assert.ok(postId, 'first post has a valid id');

      console.log('posts');
      console.log(posts);

      adapter.deleteRelationship(userModel, userId, 'posts', postId).then(success => {
        assert.ok(success, 'relationship successfully deleteed');

        adapter.findRelated(userModel, userId, 'posts').then(posts => {
          assert.equal(posts.length, 0, 'all posts are gone');
          assert.end();
        });
      });
    });
  });
});

after('disconnect adapter from database', assert => {
  adapter.disconnect().then(() => {
    assert.notOk(adapter.db, 'internal db object deleted');
    assert.end();
  }, err => {
    assert.error(err, 'no error disconnecting database');
    assert.fail('error disconnecting database');
    assert.end();
  });
});

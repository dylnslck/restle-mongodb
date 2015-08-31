export default function flushCollections(assert, db, done) {
  const users = db.collection('users');
  const posts = db.collection('posts');
  const comments = db.collection('comments');

  users.remove(usersErr => {
    assert.error(usersErr, 'no errors when removing users collection');

    posts.remove(postsErr => {
      assert.error(postsErr, 'no errors when removing posts collection');

      comments.remove(commentsErr => {
        assert.error(commentsErr, 'no errors when removing comments collection');
        done();
      });
    });
  });
}

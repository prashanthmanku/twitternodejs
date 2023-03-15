const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("server is Running At http://localhost:3000/")
    );
  } catch (e) {
    console.log(`Db Error ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//middleware function
const authentication = async (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "mpa", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        // request.loginUserName = payload.username;
        const selectLoginUserQuery = `
            SELECT * 
            FROM user 
            WHERE username='${payload.username}';
        `;
        const dbLoginUser = await db.get(selectLoginUserQuery);
        request.dbLoginUser = dbLoginUser;

        next();
      }
    });
  }
};

//register User API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selctUserQuery = `SELECT * 
                            FROM user 
                            WHERE 
                            username='${username}';
                            `;
  const dbUser = await db.get(selctUserQuery);
  if (dbUser === undefined) {
    //create user
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
                    INSERT INTO user
                    (
                      name,username,password,gender  
                    )
                    VALUES
                    (
                        '${name}',
                        '${username}',
                        '${hashedPassword}',
                        '${gender}'
                    );

            `;
      const responsedb = await db.run(createUserQuery);
      //   response.send({ user_id: responsedb.lastID });
      response.send("User created successfully");
    }
  } else {
    //send as Invalid User
    response.status(400);
    response.send("User already exists");
  }
});
//login API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
            SELECT * FROM user
            WHERE username='${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    //invalid user
    response.status(400);
    response.send("Invalid user");
  } else {
    //generate jwt
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "mpa");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
/*Returns the latest tweets of people whom 
the user follows. Return 4 tweets at a time*/
app.get(`/user/tweets/feed/`, authentication, async (request, response) => {
  console.log("success");
  const { dbLoginUser } = request;
  console.log(dbLoginUser);

  //   console.log(dbLoginUser);
  const latestTweetsQuery = `
       SELECT username,tweet,date_time AS dateTime
       FROM 
       (user inner join follower 
       ON user.user_id=follower.following_user_id) as T
        INNER JOIN tweet 
        ON T.user_id=tweet.user_id
       WHERE follower.follower_user_id=${dbLoginUser.user_id}
        ORDER by tweet.date_time DESC
        LIMIT 4 offset 0
       ;
  `;
  const rQ = `
  select * from tweet where user_id IN (1,4);
  `;
  const r = await db.all(rQ);
  console.log(r);

  console.log(r);
  const latestTweets = await db.all(latestTweetsQuery);
  response.send(latestTweets);
});

//Returns the list of all names of people whom the user follows
//API4
app.get("/user/following/", authentication, async (request, response) => {
  const { dbLoginUser } = request;
  console.log("api4");
  const followingUsersQuery = `
          SELECT name
          FROM follower INNER JOIN user
          ON follower.following_user_id=user.user_id
          WHERE follower.follower_user_id=${dbLoginUser.user_id};
    `;
  const userFollowingUsers = await db.all(followingUsersQuery);
  response.send(userFollowingUsers);
});

//API 5
//Returns the list of all names of people who follows the user
app.get("/user/followers/", authentication, async (request, response) => {
  const { dbLoginUser } = request;
  const getUserFollowersQuery = `
            SELECT name
            FROM follower INNER JOIN user 
            ON follower.follower_user_id=user.user_id
            WHERE follower.following_user_id=${dbLoginUser.user_id}
    `;
  const userFollowersList = await db.all(getUserFollowersQuery);
  response.send(userFollowersList);
});
/*API 6
>>If the user requests a tweet other than the users he is following
>> If the user requests a tweet of the user he is following, 
return the tweet, likes count, replies count and date-time
*/

app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { dbLoginUser } = request;
  const { tweetId } = request.params;
  const getTweetQuery = ` 
            SELECT *
            FROM (user INNER JOIN follower 
                ON  user.user_id=follower.following_user_id) AS T 
            INNER JOIN tweet 
                ON T.user_id=tweet.user_id
                 
            WHERE 
                follower.follower_user_id=${dbLoginUser.user_id}
            AND 
                tweet.tweet_id=${tweetId}
            ;
    `;
  const requestedTweet = await db.get(getTweetQuery);
  if (requestedTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    // const requestedTweet = await db.all(getTweetQuery);
    // response.send(requestedTweet);
    const getReplysCount = `
        SELECT count(*) AS replies
        FROM reply
        WHERE tweet_id=${tweetId};
    `;
    const replysCount = await db.get(getReplysCount);
    console.log(replysCount);
    const getLikesQuery = `
            SELECT count(*) AS likes
            FROM like 
            WHERE tweet_id=${tweetId};
    `;
    const likesCount = await db.get(getLikesQuery);
    console.log(likesCount);
    const tweetlikesReplys = {
      tweet: requestedTweet.tweet,
      likes: likesCount.likes,
      replies: replysCount.replies,
      dateTime: requestedTweet.date_time,
    };
    response.send(tweetlikesReplys);
  }
});

//API 7
/*
>> If the user requests a tweet other than the users
 he is following ..Invalid Request
>>>If the user requests a tweet of a user he is following, 
return the list of usernames who liked the tweet*/
app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const { dbLoginUser } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `
            SELECT username 
            FROM follower INNER JOIN tweet 
            ON follower.following_user_id=tweet.user_id
            INNER JOIN like 
            ON tweet.tweet_id=like.tweet_id
            INNER JOIN user
            ON like.user_id=user.user_id
            WHERE follower.follower_user_id=${dbLoginUser.user_id} 
            AND tweet.tweet_id=${tweetId};
    `;
    const tweet = await db.get(getTweetQuery);
    console.log(tweet);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const tweet = await db.all(getTweetQuery);
      const likedUserNamesList = [];
      for (let i of tweet) {
        likedUserNamesList.push(i.username);
      }
      response.send({ likes: likedUserNamesList });
    }
  }
);
/*API 8
>> If the user requests a tweet
 other than the users he is following >>Invalid Request
 >> If the user requests a tweet of a user he is following, 
 return the list of replies.
 */
app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    const { dbLoginUser } = request;
    const { tweetId } = request.params;
    const tweetQuery = `
            SELECT name,reply
            FROM follower INNER JOIN tweet 
                ON follower.following_user_id=tweet.user_id
            INNER JOIN reply
            ON tweet.tweet_id=reply.tweet_id 
            INNER JOIN user 
            ON user.user_id=reply.user_id  
            WHERE 
                follower.follower_user_id=${dbLoginUser.user_id}
            AND tweet.tweet_id=${tweetId};    
    `;
    let tweetDetails = await db.get(tweetQuery);
    // console.log(tweetDetails);
    if (tweetDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      tweetDetails = await db.all(tweetQuery);
      console.log(tweetDetails);
      let repliesArry = [];
      for (let i of tweetDetails) {
        repliesArry.push(i);
      }
      response.send({ replies: repliesArry });
      console.log(repliesArry);
    }
    const rq = `select * from reply where tweet_id=${tweetId};`;
    const r = await db.all(rq);
    // console.log(r);
  }
);
/*
>>API 9
>>Returns a list of all tweets of the user*/
app.get("/user/tweets/", authentication, async (request, response) => {
  const { dbLoginUser } = request;

  const getTwitsrepliesCount = `
          SELECT *,count(reply.reply_id) as replies
          FROM tweet LEFT JOIN reply
          ON tweet.tweet_id=reply.tweet_id

          WHERE
              tweet.user_id=${dbLoginUser.user_id}

          GROUP BY tweet.tweet_id;
      `;

  const userTweetRepliesCount = await db.all(getTwitsrepliesCount);
  console.log(userTweetRepliesCount);
  const getuserTweetLikesCount = `
          SELECT *,count(like.tweet_id) as likes
          FROM tweet LEFT JOIN like
          ON tweet.tweet_id=like.tweet_id

          WHERE
              tweet.user_id=${dbLoginUser.user_id}

          GROUP BY tweet.tweet_id;
    `;
  const userTweetLikesCount = await db.all(getuserTweetLikesCount);
  console.log(userTweetLikesCount);

  const r = `select * from like where tweet_id=3;`;
  const rr = await db.all(r);
  console.log(rr);

  const userTweetsQ = `
        SELECT * 
        FROM tweet
        WHERE user_id=${dbLoginUser.user_id};
  
  `;
  const userTweets = await db.all(userTweetsQ);
  console.log(userTweets);
});
//post Tweet API
app.post("/user/tweets/", authentication, async (request, response) => {
  const { dbLoginUser } = request;
  const { tweet } = request.body;
  const postTweetQuery = `
            INSERT INTO tweet
                (tweet,user_id)
            VALUES
            ('${tweet}',${dbLoginUser.user_id});    
        `;
  const dbResponse = await db.run(postTweetQuery);
  console.log(dbResponse.lastID);
  response.send("Created a Tweet");
});

//DELETE Tweet
app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { dbLoginUser } = request;
  const { tweetId } = request.params;
  const checktweetQuery = `
        SELECT * 
        FROM tweet
        WHERE user_id=${dbLoginUser.user_id}
        AND tweet_id=${tweetId}
        ;
    `;
  const checkTweet = await db.get(checktweetQuery);
  console.log(checkTweet);
  if (checkTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deletetweetQuery = `
            DELETE FROM tweet 
            WHERE tweet_id=${tweetId};
        `;
    await db.run(deletetweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;

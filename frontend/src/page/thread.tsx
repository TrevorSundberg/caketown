import {API_POST_CREATE, API_POST_CREATE_MAX_MESSAGE_LENGTH, API_POST_LIST, ReturnedPost} from "../../../common/common";
import {AbortablePromise, Auth, abortableJsonFetch, cancel} from "../shared/shared";
import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import {LoginContext} from "./login";
import {Post} from "./post";
import React from "react";
import TextField from "@material-ui/core/TextField";

interface ThreadProps {
  id: string;
  history: import("history").History;
}

export const Thread: React.FC<ThreadProps> = (props) => {
  // We make a fake first post that includes the video to load it quicker.
  const [posts, setPosts] = React.useState<ReturnedPost[]>([
    {
      id: props.id,
      threadId: props.id,
      title: "",
      message: "",
      userdata: {
        type: "animation",
        width: 0,
        height: 0
      },
      replyId: null,
      userId: "",
      username: "",
      liked: false,
      likes: 0,
      views: 0
    }
  ]);
  const [postMessage, setPostMessage] = React.useState("");
  const [postCreateFetch, setPostCreateFetch] = React.useState<AbortablePromise<ReturnedPost>>(null);

  const loggedIn = React.useContext(LoginContext);

  React.useEffect(() => {
    const postListFetch = abortableJsonFetch<ReturnedPost[]>(API_POST_LIST, Auth.Optional, {threadId: props.id});
    postListFetch.then((postList) => {
      if (postList) {
        postList.reverse();
        setPosts(postList);
      }
    });

    return () => {
      cancel(postListFetch);
    };
  }, [loggedIn]);


  React.useEffect(() => () => {
    cancel(postCreateFetch);
  }, []);

  return <div>
    {posts.map((post) => <Post
      preview={false}
      key={post.id}
      post={post}
      cardStyle={{marginBottom: 4}}
      videoProps={{autoPlay: true}}
      history={props.history}/>)}
    <Card>
      <CardContent>
        <form>
          <TextField
            fullWidth
            disabled={Boolean(postCreateFetch)}
            label="Comment"
            inputProps={{maxLength: API_POST_CREATE_MAX_MESSAGE_LENGTH}}
            value={postMessage}
            onChange={(e) => {
              setPostMessage(e.target.value);
            }}/>
          <Button
            type="submit"
            style={{display: "none"}}
            disabled={Boolean(postCreateFetch)}
            onClick={async () => {
              const postCreateFetchPromise = abortableJsonFetch<ReturnedPost>(API_POST_CREATE, Auth.Required, {
                message: postMessage,
                replyId: props.id
              });
              setPostCreateFetch(postCreateFetchPromise);

              const newPost = await postCreateFetchPromise;
              if (newPost) {
                // Append our post to the end.
                setPosts((previous) => [
                  ...previous,
                  newPost
                ]);
              }
              setPostCreateFetch(null);
              setPostMessage("");
            }}>
            Post
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>;
};

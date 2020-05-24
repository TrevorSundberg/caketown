import {AbortablePromise, abortableJsonFetch, cancel, makeUrl} from "../shared/shared";
import {API_THREAD_LIST} from "../../../common/common";
import React from "react";

interface Thread {
  id: string;
  title: string;
}

interface ThreadsProps {
  history: import("history").History;
}

interface ThreadsState {
  threads: Thread[];
}

export class Threads extends React.Component<ThreadsProps, ThreadsState> {
  public state: ThreadsState = {
    threads: []
  }

  private threadListFetch: AbortablePromise<Thread[]>;

  public async componentDidMount () {
    this.threadListFetch = abortableJsonFetch<Thread[]>(API_THREAD_LIST);
    const threads = await this.threadListFetch;
    if (threads) {
      this.setState({threads});
    }
  }

  public componentWillUnmount () {
    cancel(this.threadListFetch);
  }

  public render () {
    return (
      <div style={{
        columnCount: 4,
        columnWidth: "150px",
        columnGap: "10px"
      }}>
        {this.state.threads.map((thread) => <div
          key={thread.id}
          style={{
            borderRadius: "3px",
            overflow: "hidden",
            backgroundColor: "white",
            marginBottom: "10px",
            breakInside: "avoid"
          }}
          onClick={() => {
            this.props.history.push(`/thread?threadId=${thread.id}`);
          }}>
          <video
            style={{width: "100%"}}
            muted
            loop
            onMouseEnter={(event) => (event.target as HTMLVideoElement).play().catch(() => 0)}
            onMouseLeave={(event) => (event.target as HTMLVideoElement).pause()}
            onTouchStart={(event) => (event.target as HTMLVideoElement).play().catch(() => 0)}
            onTouchEnd={(event) => (event.target as HTMLVideoElement).pause()}
            src={makeUrl("/api/animation/video", {id: thread.id})}>
          </video>
          <div
            style={{padding: "6px", paddingTop: "0px"}}>
            TITLE: {thread.title}
          </div>
        </div>)}
      </div>);
  }
}
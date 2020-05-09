import {Editor} from "./editor";
import React from "react";
import ReactDOM from "react-dom";

export class EditorComponent extends React.Component {
  private editor: Editor;

  public componentDidMount () {
    // eslint-disable-next-line react/no-find-dom-node
    this.editor = new Editor(ReactDOM.findDOMNode(this) as HTMLElement);
  }

  public componentWillUnmount () {
    this.editor.destroy();
  }

  public render () {
    return <div></div>;
  }
}

import "./modal.css";
import Button from "@material-ui/core/Button";
import CloseIcon from "@material-ui/icons/Close";
import {Deferred} from "../shared/shared";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import IconButton from "@material-ui/core/IconButton";
import React from "react";
import {useStyles} from "../page/style";

export const MODALS_CHANGED = "modalsChanged";

export type ModalCallback = (button: ModalButton) => unknown;

export interface ModalButton {
  name: string;

  dismiss?: boolean;

  callback?: ModalCallback;

  submitOnEnter?: boolean;
}

export interface ModalOpenParameters {
  title?: string;
  dismissable?: boolean;
  fullscreen?: boolean;
  buttons?: ModalButton[];
  content?: JQuery;
  render? (): React.ReactNode;
  onShown?: () => unknown;
}

export interface ModalProps extends ModalOpenParameters {
  id: number;
  defer: Deferred<ModalButton>;
}

const allModals: ModalProps[] = [];
let modalIdCounter = 0;

const removeModalInternal = (id: number) => {
  const index = allModals.findIndex((modal) => modal.id === id);
  if (index !== -1) {
    allModals[index].defer.resolve(null);
    allModals.splice(index, 1);
    window.dispatchEvent(new Event(MODALS_CHANGED));
  }
};

export const ModalComponent: React.FC<ModalProps> = (props) => {
  const classes = useStyles();
  const hasSubmitButton = Boolean(props.buttons && props.buttons.find((button) => button.submitOnEnter));
  const content = <div>
    <DialogContent>
      { props.children }
      <div ref={(ref) => {
        if (props.content) {
          props.content.appendTo(ref);
        }
        if (props.onShown) {
          props.onShown();
        }
      }}>
        {props.render ? props.render() : null}
      </div>
    </DialogContent>
    <DialogActions>
      {
        (props.buttons || []).map((button) => <Button
          key={button.name}
          onClick={() => {
            if (props.defer) {
              props.defer.resolve(button);
            }
            if (button.callback) {
              button.callback(button);
            }
            removeModalInternal(props.id);
          }}
          color="primary"
          type={button.submitOnEnter ? "submit" : "button"}>
          {button.name}
        </Button>)
      }
    </DialogActions>
  </div>;

  return <Dialog
    open={true}
    disableBackdropClick={!props.dismissable}
    disableEscapeKeyDown={!props.dismissable}
    onClose={() => removeModalInternal(props.id)}
    fullScreen={props.fullscreen}
    aria-labelledby="alert-dialog-title"
    aria-describedby="alert-dialog-description"
  >
    <DialogTitle id="alert-dialog-title">
      {props.title}
      {
        props.dismissable
          ? <IconButton
            aria-label="close"
            className={classes.closeButton}
            onClick={() => removeModalInternal(props.id)}>
            <CloseIcon />
          </IconButton>
          : null
      }
    </DialogTitle>
    {
      hasSubmitButton
        ? <form>{content}</form>
        : content
    }
  </Dialog>;
};

export const ModalContainer: React.FC = () => {
  const [
    modals,
    setModals
  ] = React.useState<ModalProps[]>(allModals);
  React.useEffect(() => {
    const onModalsChanged = () => {
      setModals([...allModals]);
    };
    window.addEventListener(MODALS_CHANGED, onModalsChanged);
    return () => {
      window.removeEventListener(MODALS_CHANGED, onModalsChanged);
    };
  }, []);
  return <div>{modals.map((modal) => <ModalComponent key={modal.id} {...modal}/>)}</div>;
};

export class Modal {
  private id = modalIdCounter++;

  public async open (params: ModalOpenParameters): Promise<ModalButton> {
    const defer = new Deferred<ModalButton>();
    allModals.push({
      ...params,
      defer,
      id: this.id
    });
    window.dispatchEvent(new Event(MODALS_CHANGED));
    return defer;
  }

  public hide () {
    removeModalInternal(this.id);
  }

  public static async messageBox (title: string, text: string): Promise<ModalButton> {
    const modal = new Modal();
    return modal.open({
      buttons: [
        {
          dismiss: true,
          name: "Close"
        }
      ],
      content: $("<p/>").text(text),
      dismissable: true,
      title
    });
  }
}

import {AnimationData, Track, Tracks, WidgetInit} from "../../../common/common";
import {Gif, Image, StaticImage} from "./image";
import {RELATIVE_WIDGET_SIZE, Size, TimeRange, UPDATE, Utility, getAspect, resizeMinimumKeepAspect} from "./utility";
import {Background} from "./background";
import {Gizmo} from "./gizmo";
import {Renderer} from "./renderer";
import {Spinner} from "./spinner";
import {Timeline} from "./timeline";
import {VideoPlayer} from "./videoPlayer";
import {setHasUnsavedChanges} from "../shared/unload";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const uuidv4: typeof import("uuid/v4") = require("uuid/v4");

const FakeFrameTime = -1;

export type ElementFactory = (id: string) => Promise<HTMLElement>;

export class Widget {
  public readonly element: HTMLElement;

  public readonly init: WidgetInit;

  /** @internal */
  public constructor (element: HTMLElement, init: WidgetInit) {
    this.element = element;
    this.init = init;
  }
}

export class Manager {
  private tracks: Tracks = {};

  private widgetContainer: HTMLDivElement;

  private videoPlayer: VideoPlayer;

  private timeline: Timeline;

  public selection: Gizmo = null;

  private widgets: Widget[] = [];

  private readonly renderer: Renderer;

  public updateExternally = false;

  public readonly spinner = new Spinner();

  private requestedAnimationFrame: number;

  public constructor (
    background: Background,
    container: HTMLDivElement,
    widgetContainer: HTMLDivElement,
    videoPlayer: VideoPlayer,
    timeline: Timeline,
    renderer: Renderer
  ) {
    this.widgetContainer = widgetContainer;
    this.videoPlayer = videoPlayer;
    this.timeline = timeline;
    this.renderer = renderer;
    this.update();

    const updateContainerSize = (aspectSize: Size, scale: number) => {
      container.style.width = `${aspectSize[0]}px`;
      container.style.height = `${aspectSize[1]}px`;
      container.style.transform = `translate(${0}px, ${0}px) scale(${scale})`;

      const width = aspectSize[0] * scale;
      const height = aspectSize[1] * scale;

      container.style.left = `${(window.innerWidth - width) / 2}px`;
      container.style.top = `${(window.innerHeight - height) / 2}px`;
    };

    const onResize = () => {
      const aspectSize = videoPlayer.getAspectSize();
      const windowSize: Size = [
        window.innerWidth,
        window.innerHeight
      ];
      if (getAspect(aspectSize) > getAspect(windowSize)) {
        updateContainerSize(aspectSize, window.innerWidth / aspectSize[0]);
      } else {
        updateContainerSize(aspectSize, window.innerHeight / aspectSize[1]);
      }
    };
    videoPlayer.video.addEventListener("canplay", onResize);
    window.addEventListener("resize", onResize);
    onResize();

    const onUpdate = () => {
      this.requestedAnimationFrame = requestAnimationFrame(onUpdate);
      window.dispatchEvent(new Event(UPDATE));
      this.update();
    };
    onUpdate();

    const deselectElement = (event: Event) => {
      if (event.target === widgetContainer || event.target === background.canvas) {
        // If we're touching down, only deselect if it's the only touch (we may be dragging the gizmo).
        if (window.TouchEvent && event instanceof TouchEvent ? event.touches.length === 1 : true) {
          this.selectWidget(null);
        }
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Delete") {
        this.attemptDeleteSelection();
      }
    };

    const registerInputEvents = (element: HTMLElement) => {
      element.addEventListener("mousedown", deselectElement);
      element.addEventListener("touchstart", deselectElement);
      element.addEventListener("keydown", onKeyDown);
    };
    registerInputEvents(widgetContainer);
    registerInputEvents(background.canvas);
    registerInputEvents(document.body);
  }

  public attemptDeleteSelection () {
    if (this.selection) {
      this.destroyWidget(this.selection.widget);
    }
  }

  public updateMarkers () {
    if (this.selection) {
      const track = this.tracks[`#${this.selection.widget.element.id}`];
      this.videoPlayer.setMarkers(Object.keys(track).map((str) => parseFloat(str)));
    } else {
      this.videoPlayer.setMarkers([]);
    }
  }

  public updateChanges () {
    const tracksCopy: Tracks = JSON.parse(JSON.stringify(this.tracks));
    for (const track of Object.values(tracksCopy)) {
      let hasTransform = false;

      for (const keyframe of Object.values(track)) {
        if (keyframe.transform) {
          hasTransform = true;
        }
      }

      // It's better to always have a frame of visibility so that the user can add a keyframe that hides it.
      track[FakeFrameTime] = {clip: "auto"};
      if (!hasTransform) {
        track[FakeFrameTime].transform = this.centerTransform();
      }
    }

    this.timeline.updateTracks(tracksCopy);
    this.updateMarkers();
  }

  public save (): AnimationData {
    return {
      tracks: JSON.parse(JSON.stringify(this.tracks)),
      videoAttributedSource: this.videoPlayer.getAttributedSrc(),
      widgets: this.widgets.map((widget) => JSON.parse(JSON.stringify(widget.init)))
    };
  }

  public async load (data: AnimationData) {
    this.videoPlayer.setAttributedSrc(data.videoAttributedSource);
    this.clearWidgets();
    for (const init of data.widgets) {
      await this.addWidget(init);
    }
    this.selectWidget(null);
    this.tracks = data.tracks;
    this.updateChanges();
    // Force a change so everything updates
    this.timeline.setNormalizedTime(1);
    this.timeline.setNormalizedTime(0);
    this.videoPlayer.video.currentTime = 0;
    await this.videoPlayer.loadPromise;
    setHasUnsavedChanges(false);
  }

  private update () {
    if (this.updateExternally) {
      return;
    }
    const normalizedCurrentTime = this.videoPlayer.getNormalizedCurrentTime();
    this.timeline.setNormalizedTime(normalizedCurrentTime);
    if (this.selection) {
      this.selection.update();
    }
    this.renderer.drawFrame(this.videoPlayer.video.currentTime, false);
  }

  private centerTransform () {
    return Utility.transformToCss(Utility.centerTransform(this.videoPlayer.getAspectSize()));
  }

  public async addWidget (init: WidgetInit): Promise<Widget> {
    this.spinner.show();
    const element = await (async () => {
      const img = document.createElement("img");
      img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      const {src} = init.attributedSource;
      const image = init.attributedSource.mimeType === "image/gif" ? new Gif(src) : new StaticImage(src);
      Image.setImage(img, image);
      await image.loadPromise;
      const frame = image.getFrameAtTime(0);
      const size = resizeMinimumKeepAspect([frame.width, frame.height], [RELATIVE_WIDGET_SIZE, RELATIVE_WIDGET_SIZE]);
      [img.width, img.height] = size;
      img.style.left = `${-size[0] / 2}px`;
      img.style.top = `${-size[1] / 2}px`;
      return img;
    })();

    let track: Track = {};
    if (!init.id) {
      // Replace the current widget if any is selected.
      if (this.selection) {
        init.id = this.selection.widget.init.id;
        track = this.tracks[`#${init.id}`];
        this.destroyWidget(this.selection.widget);
      } else {
        init.id = `id-${uuidv4()}`;
      }
    }

    const {id} = init;
    if (this.tracks[`#${id}`]) {
      this.spinner.hide();
      throw new Error(`Widget id already exists: ${id}`);
    }

    element.id = id;
    element.className = "widget";
    element.draggable = false;
    element.ondragstart = (event) => {
      event.preventDefault();
      return false;
    };
    element.style.transform = this.centerTransform();
    element.style.clip = "auto";
    this.widgetContainer.appendChild(element);

    this.tracks[`#${id}`] = track;
    this.updateChanges();
    setHasUnsavedChanges(true);
    const widget = new Widget(element, init);
    this.widgets.push(widget);

    const grabElement = (event) => {
      this.selectWidget(widget);
      this.selection.moveable.dragStart(event);
    };
    element.addEventListener("mousedown", grabElement, true);
    element.addEventListener("touchstart", grabElement, true);

    this.selectWidget(widget);
    this.spinner.hide();
    return widget;
  }

  private isSelected (widget?: Widget) {
    if (this.selection === null && widget === null) {
      return true;
    }
    if (this.selection && widget && this.selection.widget.element === widget.element) {
      return true;
    }
    return false;
  }

  public selectWidget (widget?: Widget) {
    if (this.isSelected(widget)) {
      return;
    }
    if (this.selection) {
      this.selection.destroy();
      this.selection = null;
    }
    if (widget) {
      this.widgetContainer.focus();
      this.selection = new Gizmo(widget);
      // We intentionally do not call removeEventListener because we already create a new Gizmo each time.
      this.selection.addEventListener(
        "transformKeyframe",
        // We also do not use `this.selection.widget` because we clear selection on motion capture.
        () => this.keyframe(widget.element, "transform")
      );
    }
    this.updateMarkers();
  }

  public destroyWidget (widget: Widget) {
    if (this.isSelected(widget)) {
      this.selectWidget(null);
    }
    widget.element.remove();
    delete this.tracks[`#${widget.init.id}`];
    this.updateChanges();
    setHasUnsavedChanges(true);
    this.widgets.splice(this.widgets.indexOf(widget), 1);
  }

  public clearWidgets () {
    while (this.widgets.length !== 0) {
      this.destroyWidget(this.widgets[0]);
    }
  }

  public toggleVisibility (element: HTMLElement) {
    const {style} = element;
    style.clip = style.clip === "auto" ? "unset" : "auto";
    this.keyframe(element, "clip");
  }

  private keyframe (element: HTMLElement, type: "clip" | "transform") {
    const track = this.tracks[`#${element.id}`];
    const normalizedTime = this.videoPlayer.getNormalizedCurrentTime();
    const existingKeyframe = track[normalizedTime];

    const newKeyframe = type === "clip"
      ? {clip: element.style.clip}
      : {transform: Utility.transformToCss(Utility.getTransform(element))};

    // If on the same frame where a 'clip' existed you add a 'transform', this keeps both.
    track[normalizedTime] = {...existingKeyframe, ...newKeyframe};
    this.updateChanges();
    setHasUnsavedChanges(true);
  }


  public deleteKeyframesInRange (widgetTrackId: string, range: TimeRange) {
    let result = false;
    const track = this.tracks[widgetTrackId];
    if (track) {
      for (const normalizedTimeStr of Object.keys(track)) {
        const normalizedTime = parseFloat(normalizedTimeStr);
        if (normalizedTime >= range[0] && normalizedTime <= range[1]) {
          delete track[normalizedTimeStr];
          result = true;
        }
      }
    }
    return result;
  }

  public destroy () {
    this.selectWidget(null);
    cancelAnimationFrame(this.requestedAnimationFrame);
    setHasUnsavedChanges(false);
  }
}

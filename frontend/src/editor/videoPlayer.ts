import "./videoPlayer.css";
import {AttributedSource, MAX_VIDEO_SIZE} from "../../../common/common";
import {RELATIVE_VIDEO_SIZE, Size, TimeRange, resizeMinimumKeepAspect} from "./utility";
import {Deferred} from "../shared/shared";

interface Point {
  clientX: number;
  clientY: number;
}

export class VideoPlayer extends EventTarget {
  public readonly video: HTMLVideoElement;

  private controlsContainer: HTMLDivElement;

  private playPauseButton: HTMLDivElement;

  private position: HTMLDivElement;

  private timeline: HTMLDivElement;

  private selection: HTMLDivElement;

  private readonly markers: HTMLDivElement[] = [];

  public loadPromise = new Deferred<void>();

  public selectionStartNormalized = 0;

  public selectionEndNormalized = 1;

  public constructor (videoParent: HTMLDivElement, controlsParent: HTMLElement) {
    super();
    this.video = document.createElement("video");
    videoParent.appendChild(this.video);
    this.video.className = "videoPlayer";
    this.video.crossOrigin = "anonymous";
    this.video.loop = true;
    this.video.muted = true;
    this.video.preload = "auto";

    this.video.setAttribute("webkit-playsinline", "true");
    this.video.setAttribute("playsinline", "true");
    (this.video as any).playsInline = true;
    (this.video as any).playsinline = true;

    (this.video as any).disableRemotePlayback = true;
    this.video.oncontextmenu = () => false;

    this.controlsContainer = document.createElement("div");
    this.controlsContainer.className = "videoControlsContainer";
    controlsParent.appendChild(this.controlsContainer);

    this.playPauseButton = document.createElement("div");
    this.controlsContainer.appendChild(this.playPauseButton);
    this.playPauseButton.className = "videoPlayPauseButton button fas fa-play";

    this.video.addEventListener("play", () => {
      this.playPauseButton.classList.remove("fa-play");
      this.playPauseButton.classList.add("fa-pause");
    });
    this.video.addEventListener("pause", () => {
      this.playPauseButton.classList.remove("fa-pause");
      this.playPauseButton.classList.add("fa-play");
    });
    this.playPauseButton.addEventListener("click", () => {
      if (this.video.paused) {
        this.video.play().catch(() => 0);
      } else {
        this.video.pause();
      }
    });

    this.timeline = document.createElement("div");
    this.controlsContainer.appendChild(this.timeline);
    this.timeline.className = "videoTimeline";

    this.selection = document.createElement("div");
    this.timeline.appendChild(this.selection);
    this.selection.className = "videoSelection";

    this.position = document.createElement("div");
    this.timeline.appendChild(this.position);
    this.position.className = "videoPosition";

    const updatePosition = () => {
      const interpolant = this.video.currentTime / this.video.duration;
      this.position.style.width = `${interpolant * 100}%`;
    };
    window.addEventListener("update", updatePosition);

    const updateTimelineFromPoint = (event: Point, start: boolean) => {
      const rect = this.timeline.getBoundingClientRect();
      const left = event.clientX - rect.left;
      const interpolant = Math.max(Math.min(left / rect.width, 0.9999), 0);
      this.video.currentTime = this.video.duration * interpolant;
      updatePosition();
      if (start) {
        this.selectionStartNormalized = interpolant;
      }
      this.selectionEndNormalized = interpolant;

      const selectionRange = this.getSelectionRangeInOrder();
      this.selection.style.left = `${selectionRange[0] * 100}%`;
      this.selection.style.right = `${(1 - selectionRange[1]) * 100}%`;
    };

    const onTouchMove = (event: TouchEvent) => {
      updateTimelineFromPoint(event.touches[0], event.type === "touchstart");
    };
    this.timeline.addEventListener("touchstart", (event) => {
      this.timeline.addEventListener("touchmove", onTouchMove);
      onTouchMove(event);
    });
    this.timeline.addEventListener("touchend", () => {
      this.timeline.removeEventListener("touchmove", onTouchMove);
    });

    const onPointerMove = (event: PointerEvent) => {
      updateTimelineFromPoint(event, event.type === "pointerdown");
    };
    this.timeline.addEventListener("pointerdown", (event) => {
      this.timeline.setPointerCapture(event.pointerId);
      this.timeline.addEventListener("pointermove", onPointerMove);
      onPointerMove(event);
    });
    this.timeline.addEventListener("pointerup", (event) => {
      this.timeline.releasePointerCapture(event.pointerId);
      this.timeline.removeEventListener("pointermove", onPointerMove);
    });

    this.video.addEventListener("canplaythrough", () => {
      this.loadPromise.resolve();
      // Other libraries such as OpenCV.js rely on video.width/height being set.
      this.video.width = this.video.videoWidth;
      this.video.height = this.video.videoHeight;
    });
  }

  public getSelectionRangeInOrder (): TimeRange {
    if (this.selectionStartNormalized > this.selectionEndNormalized) {
      return [
        this.selectionEndNormalized,
        this.selectionStartNormalized
      ];
    }
    return [
      this.selectionStartNormalized,
      this.selectionEndNormalized
    ];
  }

  public async setAttributedSrc (attributedSource: AttributedSource) {
    this.loadPromise = new Deferred<void>();
    // Workers static doesn't support Accept-Ranges, so we just preload the entire video.
    const response = await fetch(attributedSource.src);
    const blob = await response.blob();
    this.video.src = URL.createObjectURL(blob);
    this.video.dataset.src = attributedSource.src;
    this.video.dataset.attributionJson = JSON.stringify(attributedSource);
    await this.loadPromise;
    this.dispatchEvent(new Event("srcChanged"));
  }

  public getAttributedSrc (): AttributedSource {
    return JSON.parse(this.video.dataset.attributionJson);
  }

  public setMarkers (normalizedMarkerTimes: number[]) {
    for (const marker of this.markers) {
      marker.remove();
    }
    this.markers.length = 0;

    for (const normalizedMarkerTime of normalizedMarkerTimes) {
      const marker = document.createElement("div");
      this.timeline.appendChild(marker);
      marker.className = "videoMarker";
      marker.style.left = `${normalizedMarkerTime * 100}%`;
      this.markers.push(marker);
    }
  }

  public getRawSize (): Size {
    return [
      this.video.videoWidth || MAX_VIDEO_SIZE,
      this.video.videoHeight || MAX_VIDEO_SIZE
    ];
  }

  public getAspectSize () {
    return resizeMinimumKeepAspect(this.getRawSize(), [RELATIVE_VIDEO_SIZE, RELATIVE_VIDEO_SIZE]);
  }

  public getNormalizedCurrentTime () {
    return this.video.currentTime / (this.video.duration || 1);
  }
}

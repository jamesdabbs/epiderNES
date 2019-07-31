open Action;

[@react.component]
let make = (~frame: Rawbones.Render.frame, ~dispatch) => {
  let canvasRef = React.useRef(Js.Nullable.null);

  React.useEffect(() => {
    Util.displayFrameScaled(canvasRef, frame);
    None;
  });

  <div
    tabIndex=0
    onKeyDown={event => dispatch(KeyDown(ReactEvent.Keyboard.which(event)))}
    onKeyUp={event => dispatch(KeyUp(ReactEvent.Keyboard.which(event)))}>
    <canvas ref={ReactDOMRe.Ref.domRef(canvasRef)} width="512" height="480" />
  </div>;
};
[@react.component]
let make = (~frame: Rawbones.Render.frame) => {
  let canvasRef = React.useRef(Js.Nullable.null);

  React.useEffect(() => {
    Util.displayFrameScaled(canvasRef, frame);
    None;
  });

  <canvas ref={ReactDOMRe.Ref.domRef(canvasRef)} width="512" height="480" />;
};
[@react.component]
let make = (~rom: Rawbones.Rom.t) => {
  let table = Rawbones.Pattern.Table.load(rom);

  let canvasRef = React.useRef(Js.Nullable.null);

  React.useEffect(() => {
    Util.drawTiles(canvasRef, table);
    None;
  });

  <canvas
    ref={ReactDOMRe.Ref.domRef(canvasRef)}
    height="1024"
    width="1024"
  />;
};
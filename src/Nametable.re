[@react.component]
let make = (~nes: Rawbones.Nes.t) => {
  // let nameTable = nes.ppu.name_table;

  let c1 = React.useRef(Js.Nullable.null);
  let c2 = React.useRef(Js.Nullable.null);
  let c3 = React.useRef(Js.Nullable.null);
  let c4 = React.useRef(Js.Nullable.null);

  React.useEffect(() => {
    List.iteri(
      (i, canvas) => {
        let frame = Rawbones.Render.Context.render_nametable(nes.render, i);
        Util.displayFrame(canvas, frame);
      },
      [c1, c2, c3, c4],
    );

    None;
  });

  <>
    <div className="columns">
      <canvas
        className="column is-4"
        ref={ReactDOMRe.Ref.domRef(c1)}
        width="256"
        height="240"
      />
      <canvas
        className="column is-4"
        ref={ReactDOMRe.Ref.domRef(c2)}
        width="256"
        height="240"
      />
    </div>
    <div className="columns">
      <canvas
        className="column is-4"
        ref={ReactDOMRe.Ref.domRef(c3)}
        width="256"
        height="240"
      />
      <canvas
        className="column is-4"
        ref={ReactDOMRe.Ref.domRef(c4)}
        width="256"
        height="240"
      />
    </div>
  </>;
};
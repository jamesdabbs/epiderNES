type state = option(Rawbones.Nes.t);

[@react.component]
let make = () => {
  let (state, setState) = React.useState(() => None);

  let bindToWindow: Rawbones.Nes.t => unit = [%bs.raw
    {|
    function(nes) { window.nes = nes; }
  |}
  ];

  // TODO: cache in local storage
  let doLoad = nes =>
    setState(_ => {
      bindToWindow(nes);
      Some(nes);
    });

  React.useEffect(() => {
    switch (state) {
    | None => Util.loadRom("nestest.nes", doLoad)
    | _ => ()
    };
    None;
  });

  let main =
    switch (state) {
    | Some(nes) => <Nes nes />
    | _ => <span />
    };

  <> <Navbar nes=state onRomLoad=doLoad /> main </>;
};
[@react.component]
let make =
    (~nes: option(Rawbones.Nes.t), ~onRomLoad, ~fps, ~running, ~dispatch) => {
  let link = (label, path) =>
    <a className="navbar-item" onClick={_ => ReasonReactRouter.push(path)}>
      {ReasonReact.string(label)}
    </a>;

  let rom_name =
    switch (nes) {
    | Some(n) => n.rom.pathname
    | _ => "EpiderNES"
    };

  let framerate =
    switch (fps) {
    | None => ReasonReact.null
    | Some(x) =>
      <a className="navbar-item">
        {ReasonReact.string("FPS: " ++ string_of_int(x))}
      </a>
    };

  <nav className="navbar" role="navigation" ariaLabel="main navigation">
    <div className="navbar-brand"> {link(rom_name, "/epiderNES")} </div>
    <div className="navbar-menu">
      <div className="navbar-start">
        {link("CPU", "/epiderNES/cpu")}
        {link("PPU", "/epiderNES/ppu")}
        framerate
      </div>
      <div className="navbar-end">
        {switch (nes) {
         | Some(n) => <NavControls nes=n running dispatch />
         | _ => <span />
         }}
        <div className="navbar-item has-dropdown is-hoverable">
          <a className="navbar-link"> {ReasonReact.string("ROMs")} </a>
          <div className="navbar-dropdown">
            <PublicRom
              className="navbar-item"
              name="NEStest"
              path="nestest.nes"
              onLoad=onRomLoad
            />
            <hr className="navbar-divider" />
            <a className="navbar-item"> <Upload onLoad=onRomLoad /> </a>
          </div>
        </div>
      </div>
    </div>
  </nav>;
};
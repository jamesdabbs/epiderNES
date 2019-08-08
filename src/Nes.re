[@react.component]
let make = (~nes: option(Rawbones.Nes.t), ~dispatch) => {
  let url = ReasonReactRouter.useUrl();
  let empty = ReasonReact.null;

  let debugger = nes => {
    <div className="columns">
      <div className="column is-2"> <Cpu.Registers nes dispatch /> </div>
      <div className="column is-5"> <Cpu.Disassembly nes rows=20 /> </div>
      <div className="column is-5"> <Ppu nes /> </div>
    </div>;
  };

  switch (url.path, nes) {
  | (["epiderNES"], Some(n)) => <Display frame={n.frame} dispatch />
  | (["epiderNES", "cpu"], Some(n)) => debugger(n)
  | (["epiderNES", "ppu"], Some(n)) => <Nametable nes=n />
  | (_, None) => empty
  | _ => <p> {ReasonReact.string("Not found")} </p>
  };
};
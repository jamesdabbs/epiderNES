type state = {cpu: option(Rawbones.Cpu.t)};

[@react.component]
let make = () => {
  let (state, setState) = React.useState(() => {cpu: None});

  let loadCpu = cpu => setState(_ => {cpu: Some(cpu)});

  let preview =
    switch (state.cpu) {
    | Some(cpu) => <> <h1> {ReasonReact.string("Cpu")} </h1> <Cpu cpu /> </>
    | _ => <span />
    };

  <div className="columns">
    <div className="column">
      <h1> {ReasonReact.string("Upload a ROM")} </h1>
      <Upload onLoad=loadCpu />
    </div>
    <div className="column"> preview </div>
  </div>;
};
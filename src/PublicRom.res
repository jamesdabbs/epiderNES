@react.component
let make = (~name, ~path, ~onLoad, ~className) =>
  <a className onClick={_ => Util.loadRom(path, onLoad)}> {ReasonReact.string(name)} </a>

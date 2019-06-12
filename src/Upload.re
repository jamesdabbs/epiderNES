[@react.component]
let make = (~onLoad) => {
  let fileRef = React.useRef(Js.Nullable.null);

  <input
    type_="file"
    ref={ReactDOMRe.Ref.domRef(fileRef)}
    onChange={_ => Util.uploadRom(fileRef, onLoad)}
  />;
};
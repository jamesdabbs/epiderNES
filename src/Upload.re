[@react.component]
let make = (~onLoad) => {
  let loadRom = (filename, raw) => {
    Util.cpu_of_string(filename, raw) |> onLoad;
  };

  let fileRef = React.useRef(Js.Nullable.null);

  let handleFileUpload: ((string, string) => unit) => unit = [%bs.raw
    {|
    function (handler) {
      var reader = new FileReader();

      reader.onload = function (event) {
        handler(fileRef.current.files[0].name, event.target.result);
      };

      reader.readAsBinaryString(fileRef.current.files[0]);
    }
  |}
  ];

  <input
    type_="file"
    ref={ReactDOMRe.Ref.domRef(fileRef)}
    onChange={_ => handleFileUpload(loadRom)}
  />;
};
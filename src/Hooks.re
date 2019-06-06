let useForceUpdate = () => {
  let (_, set) = React.useState(() => true);
  () => set((!));
};
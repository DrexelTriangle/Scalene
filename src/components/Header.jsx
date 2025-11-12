import NavigationBar from "./NavigationBar";
const Header = () => {

    return (
    <>
    <header className="flex justify-center flex-wrap border-b-1 border-blue-600 pt-3">
      <img className="h-auto w-[500px]" src="/images/triangle-header-logo.svg" alt="Triangle Logo"/>   
      <NavigationBar pageNames={["News", "Opinion", "Arts & Entertainment", "Sports", "Comics", "Newsletter"]}></NavigationBar>
    </header>
    </>)
}
export default Header
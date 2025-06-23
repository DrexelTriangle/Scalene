import NavigationBar from "./NavigationBar";

const weather = await fetch("https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/Philadelphia?unitGroup=metric&include=current&key=R75ZL8UTXNSKG8GBYRH82DJE4&contentType=json", {
    method: "GET"
  })
    .then(response => response.json())  // Parse the JSON from the response

const Header = () => {
    const dateVariable = new Date();
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    

    const weatherVariable = parseInt(weather.currentConditions.temp * (9/5) + 32);

    return (
    <>
      <div className="flex justify-around text-left my-7"> 
        {/* Left of image */}
        <div className='basis-4/16 justify-self-end'>
          <div>
              {dateVariable.toLocaleDateString('en-US', options)}
          </div>
          
          <div>
              <b>Today's Paper</b>
          </div>
        </div>

        <img className="basis-8/16 h-auto w-[50%]" src="/images/triangle-header-logo.svg" alt="Triangle Logo"/>

        {/* Right of image */}
        <div className='basis-4/16 justify-items-end'>
          <div>
              Philadelphia, PA: {weatherVariable} {'\u00b0'}F
          </div>
          <div>
            <b>Support Local News</b>
          </div>
        </div>
      </div>
      
      <NavigationBar pageNames={["News","Opinion", "Arts & Entertainment", "Sports", "Comics", "Newsletter"]}></NavigationBar>
      <hr className="border-blue-700 border -mx-[60px]"></hr>
    </>)
}
export default Header
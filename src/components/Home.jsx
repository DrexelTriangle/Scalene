import Header from './Header.jsx';
import Donate from './Donate.jsx';
import About from './About.jsx';
import Classifieds from './Classifieds.jsx';
import JoinTheTriangle from './JoinTheTriangle.jsx';
import PhotoGallery from './PhotoGallery.jsx';
import Staff from './Staff.jsx';
import FindATriangle from './FindATriangle.jsx';
import ContactTheTriangle from './ContactTheTriangle.jsx';
import TopArticle from './TopArticles.jsx';
import List from './List.jsx';
import ArticleSectionGroup from './ArticleSectionGroup.jsx';
import NavigationBar from './NavigationBar.jsx';

const Home = () => {  
  return (
    <>
      <Header/>
      <NavigationBar pageNames={["Comics"]}/>
      <TopArticle/>
      <List isRow={true} showSection={true} showImage={true} articleList={["SPORTS", "OPINION", "NEWS", "COMICS"]}/>
      <ArticleSectionGroup sectionName={"OPINION"} type={1}></ArticleSectionGroup>

        <div>
            <hr className='border-blue-700'/>
              ENTERTAINMENT
            <div className="grid grid-cols-12 gap-1 m-1 divide-x divide-blue-700">
                <div className="col-span-8">
                  <div className="grid grid-cols-8 divide-x divide-grey">
                    <ArticleSectionGroup sectionName={"ENTERTAINMENT"} type={2}></ArticleSectionGroup>
                  </div>
                </div>
                <div className="col-span-4">
                </div>
            </div>
        </div>

      {/*
      <Donate/>
      <About/>
      <Classifieds/>
      <JoinTheTriangle/>
      <PhotoGallery/>
      <Staff/>
      <FindATriangle/>
      <ContactTheTriangle/>
      */}
    </>
  )
};

export default Home;
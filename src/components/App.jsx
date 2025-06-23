import Home from './Home';
import Article from './Article';
import { Route, Routes, BrowserRouter as Router } from 'react-router-dom';

const App = () => {  
  return (
    <Router>
      <Routes>
        <Route path="/" exact element={<Home/>}/>
      </Routes>
    </Router>
  )
};

export default App;
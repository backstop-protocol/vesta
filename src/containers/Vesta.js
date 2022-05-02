import React, { Component } from "react";
import {observer} from "mobx-react"
import styled from "styled-components"
import {device} from "../screenSizes";
import routerStore from "../stores/router.store"
import SpActionBox from "../components/stability-pool/SpActionBox"
import Navbar from "../components/stability-pool/Navbar"
import vestaStore from "../stores/vesta.store"
import fuseStore from "../stores/fuse.store"
import VestaInfoPage from "../components/vesta/VestaInfoPage"
import userStore from "../stores/user.store"

class Vesta extends Component {

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    routerStore.setRouteProps(this.props.history) 
  }

  render() {
    const hideInfoPage = userStore.loggedIn || userStore.connecting
    const loading = vestaStore.loading && fuseStore.loading
    return (
      <div className="content">
        {hideInfoPage && <div>
          <Navbar/>
          <div className="container" >
            {loading && <div className="fade-in" style={{marginTop: '200px', textAlign: 'center'}} aria-busy={vestaStore.loading}>
              loading...
            </div>}
            {!loading && fuseStore.stabilityPools.map((sp, i)=> <SpActionBox key={i} store={sp}/>)}
            {!loading && vestaStore.stabilityPools.map((sp, i)=> <SpActionBox key={i} store={sp}/>)}
          </div>
        </div>}
        {!hideInfoPage && <VestaInfoPage/>}
      </div>
    );
  }
}

export default observer(Vesta)
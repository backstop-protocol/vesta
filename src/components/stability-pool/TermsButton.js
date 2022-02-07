import React, { Component } from "react";
import {observer} from "mobx-react"
import TermsOfUseContent from "../../components/TermsOfUseContent"
import {Close} from "../../components/style-components/Buttons"

class TermsButton extends Component {

  render() {
    return (
      <div>
        <dialog id="terms-modal" >
          <div className="container">
          <article >
            <Close
              aria-label="Close"
              onClick={()=>window.toggleModal("terms-modal")}/>
            <h3>Terms of service</h3>
            <TermsOfUseContent/>
          </article>
          </div>
        </dialog>
        <a className="secondary" style={{margin: "0"}}
          onClick={()=>window.toggleModal("terms-modal")}>
          Terms of service
        </a>
      </div>
    )
  }
}

export default observer(TermsButton)